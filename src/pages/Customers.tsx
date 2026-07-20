/**
 * 俄罗斯客户列表 —— ProTable + 新建/编辑 Modal + 行点击进 DMC 档案。
 *
 * ⚠ 别跟「工厂管理」混:
 *   工厂(Tenant)   = 中国工厂,SaaS 的付费租户,用码表的一方
 *   客户(Customer) = 俄罗斯买家/进口商,给码表的一方
 */

import { history } from '@umijs/max'
import {
  ModalForm,
  ProFormText,
  ProFormTextArea,
  ProTable,
} from '@ant-design/pro-components'
import type { ActionType, ProColumns } from '@ant-design/pro-components'
import { Button, message, Typography } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { useRef } from 'react'
import type {
  CreateCustomerRequest,
  CustomerRow,
  UpdateCustomerRequest,
} from '@dmc/contracts'
import { createCustomer, listCustomers, updateCustomer } from '@/services/admin'
import { getErrorMessage } from '@/lib/errorMsg'

function CustomerFormModal({
  editing,
  onSuccess,
}: {
  editing?: CustomerRow
  onSuccess: () => void
}) {
  const isEdit = !!editing
  return (
    <ModalForm<CreateCustomerRequest>
      title={isEdit ? '编辑客户' : '新增俄罗斯客户'}
      trigger={
        isEdit ? (
          <a onClick={(e) => e.stopPropagation()}>编辑</a>
        ) : (
          <Button type="primary" icon={<PlusOutlined />}>
            新增客户
          </Button>
        )
      }
      modalProps={{ destroyOnHidden: true, maskClosable: false }}
      width={560}
      layout="horizontal"
      labelCol={{ span: 6 }}
      wrapperCol={{ span: 16 }}
      initialValues={
        isEdit
          ? {
              name: editing.name,
              shortName: editing.shortName ?? undefined,
              contact: editing.contact ?? undefined,
              contactInfo: editing.contactInfo ?? undefined,
              note: editing.note ?? undefined,
            }
          : undefined
      }
      onFinish={async (values) => {
        try {
          if (isEdit) {
            await updateCustomer(editing.id, values as UpdateCustomerRequest)
            message.success('已保存')
          } else {
            await createCustomer(values)
            message.success('客户已创建')
          }
          onSuccess()
          return true
        } catch (err) {
          message.error(getErrorMessage(err, isEdit ? '保存失败' : '创建失败'))
          return false
        }
      }}
    >
      <ProFormText
        name="name"
        label="客户名称"
        placeholder="俄语 / 英文原名，报关对账以它为准"
        rules={[{ required: true, message: '请填写客户名称' }]}
      />
      <ProFormText
        name="shortName"
        label="内部简称"
        placeholder="列表和下拉里显示，可不填"
      />
      <ProFormText name="contact" label="联系人" />
      <ProFormText
        name="contactInfo"
        label="联系方式"
        placeholder="邮箱 / 电话 / Telegram"
      />
      <ProFormTextArea name="note" label="备注" fieldProps={{ rows: 3 }} />
    </ModalForm>
  )
}

export default function CustomersPage() {
  const actionRef = useRef<ActionType>()
  const reload = () => actionRef.current?.reload()

  const columns: ProColumns<CustomerRow>[] = [
    {
      title: '客户名称',
      dataIndex: 'name',
      ellipsis: true,
      render: (_, r) => (
        <a onClick={() => history.push(`/customers/${r.id}`)}>{r.name}</a>
      ),
    },
    { title: '简称', dataIndex: 'shortName', search: false, width: 120 },
    { title: '联系人', dataIndex: 'contact', search: false, width: 110 },
    {
      title: '联系方式',
      dataIndex: 'contactInfo',
      search: false,
      ellipsis: true,
      width: 180,
    },
    {
      title: '码表',
      dataIndex: 'batchCount',
      search: false,
      width: 90,
      render: (_, r) => `${r.batchCount} 张`,
    },
    {
      title: '码总数',
      dataIndex: 'codeCount',
      search: false,
      width: 110,
      render: (_, r) => r.codeCount.toLocaleString(),
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      search: false,
      width: 170,
      render: (_, r) => new Date(r.createdAt).toLocaleString('zh-CN'),
    },
    {
      title: '操作',
      valueType: 'option',
      width: 120,
      render: (_, r) => [
        <CustomerFormModal key="edit" editing={r} onSuccess={reload} />,
        <a key="detail" onClick={() => history.push(`/customers/${r.id}`)}>
          DMC 档案
        </a>,
      ],
    },
  ]

  return (
    <ProTable<CustomerRow>
      headerTitle="俄罗斯客户"
      actionRef={actionRef}
      columns={columns}
      rowKey="id"
      search={{ labelWidth: 'auto' }}
      toolBarRender={() => [<CustomerFormModal key="create" onSuccess={reload} />]}
      request={async (params) => {
        const res = await listCustomers({
          page: params.current ?? 1,
          pageSize: params.pageSize ?? 20,
          search: params.name || undefined,
        })
        return { data: res.items, total: res.total, success: true }
      }}
      tableExtraRender={() => (
        <Typography.Paragraph type="secondary" style={{ margin: '0 0 8px' }}>
          客户 = 给 DMC 码表的俄罗斯买家 / 进口商，跟「工厂管理」里的中国工厂不是一回事。
          码表上传时选定客户后，系统会自动跟该客户历史码表查重。
        </Typography.Paragraph>
      )}
    />
  )
}
